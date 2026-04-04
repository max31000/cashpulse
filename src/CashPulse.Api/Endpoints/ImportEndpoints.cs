using System.Globalization;
using System.Text;
using CashPulse.Api.Middleware;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;

namespace CashPulse.Api.Endpoints;

public static class ImportEndpoints
{
    public static void MapImportEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/import");

        group.MapPost("/csv/preview", PreviewCsv);
        group.MapPost("/csv", ImportCsv);
    }

    private static async Task<IResult> PreviewCsv(HttpRequest request)
    {
        if (!request.HasFormContentType)
            throw new ValidationException("Request must be multipart/form-data");

        var form = await request.ReadFormAsync();
        var file = form.Files.FirstOrDefault();

        if (file == null)
            throw new ValidationException("No file uploaded");

        using var reader = new StreamReader(file.OpenReadStream(), Encoding.UTF8);
        var lines = new List<string>();
        string? line;
        int lineCount = 0;
        while ((line = await reader.ReadLineAsync()) != null && lineCount < 10)
        {
            lines.Add(line);
            lineCount++;
        }

        if (!lines.Any())
            throw new ValidationException("File is empty");

        // Parse header and first rows
        var header = ParseCsvLine(lines[0]);
        var rows = lines.Skip(1).Select(l => ParseCsvLine(l)).ToList();

        return Results.Ok(new
        {
            fileName = file.FileName,
            headers = header,
            preview = rows,
            totalPreviewLines = rows.Count
        });
    }

    private static async Task<IResult> ImportCsv(
        HttpRequest request,
        HttpContext ctx,
        IOperationRepository opRepo,
        ICategoryRepository catRepo,
        ICsvImportRepository importRepo)
    {
        var userId = (ulong)ctx.Items["UserId"]!;

        if (!request.HasFormContentType)
            throw new ValidationException("Request must be multipart/form-data");

        var form = await request.ReadFormAsync();
        var file = form.Files.FirstOrDefault();

        if (file == null)
            throw new ValidationException("No file uploaded");

        var columnMappingJson = form["columnMapping"].ToString();
        if (string.IsNullOrEmpty(columnMappingJson))
            throw new ValidationException("columnMapping is required");

        Dictionary<string, string>? columnMapping;
        try
        {
            columnMapping = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(columnMappingJson);
        }
        catch
        {
            throw new ValidationException("Invalid columnMapping JSON");
        }

        if (columnMapping == null || !columnMapping.ContainsKey("date") || !columnMapping.ContainsKey("amount"))
            throw new ValidationException("columnMapping must include at least 'date' and 'amount' keys");

        using var reader = new StreamReader(file.OpenReadStream(), Encoding.UTF8);
        var allLines = new List<string>();
        string? line;
        while ((line = await reader.ReadLineAsync()) != null)
            allLines.Add(line);

        if (!allLines.Any())
            throw new ValidationException("File is empty");

        var header = ParseCsvLine(allLines[0]);
        var headerIndex = header.Select((h, i) => (h.Trim(), i)).ToDictionary(x => x.Item1, x => x.i);

        // Get column indices based on mapping
        int? GetColumnIndex(string fieldName)
        {
            if (!columnMapping.TryGetValue(fieldName, out var headerName)) return null;
            return headerIndex.TryGetValue(headerName.Trim(), out var idx) ? idx : null;
        }

        var dateIdx = GetColumnIndex("date");
        var amountIdx = GetColumnIndex("amount");
        var currencyIdx = GetColumnIndex("currency");
        var descriptionIdx = GetColumnIndex("description");
        var categoryNameIdx = GetColumnIndex("category_name");

        if (dateIdx == null || amountIdx == null)
            throw new ValidationException("Could not find date or amount columns in CSV header");

        // Load categories for matching
        var categories = (await catRepo.GetByUserIdAsync(userId)).ToList();

        var importedOps = new List<PlannedOperation>();
        var errors = new List<string>();

        foreach (var dataLine in allLines.Skip(1))
        {
            if (string.IsNullOrWhiteSpace(dataLine)) continue;

            try
            {
                var cols = ParseCsvLine(dataLine);

                if (cols.Length <= dateIdx.Value || cols.Length <= amountIdx.Value)
                    continue;

                var dateStr = cols[dateIdx.Value].Trim();
                var amountStr = cols[amountIdx.Value].Trim().Replace(',', '.');

                if (!DateOnly.TryParseExact(dateStr, new[] { "dd.MM.yyyy", "yyyy-MM-dd", "MM/dd/yyyy", "d.M.yyyy" },
                    CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
                    continue;

                if (!decimal.TryParse(amountStr, NumberStyles.Any, CultureInfo.InvariantCulture, out var amount))
                    continue;

                if (amount == 0) continue;

                var currency = currencyIdx.HasValue && cols.Length > currencyIdx.Value
                    ? cols[currencyIdx.Value].Trim().ToUpper()
                    : "RUB";

                if (string.IsNullOrEmpty(currency)) currency = "RUB";

                var description = descriptionIdx.HasValue && cols.Length > descriptionIdx.Value
                    ? cols[descriptionIdx.Value].Trim()
                    : null;

                ulong? categoryId = null;
                if (categoryNameIdx.HasValue && cols.Length > categoryNameIdx.Value)
                {
                    var catName = cols[categoryNameIdx.Value].Trim();
                    var matchedCat = categories.FirstOrDefault(c =>
                        c.Name.Equals(catName, StringComparison.OrdinalIgnoreCase));
                    categoryId = matchedCat?.Id;
                }

                var op = new PlannedOperation
                {
                    UserId = userId,
                    AccountId = 0, // No account in CSV import - will need to be assigned
                    Amount = amount,
                    Currency = currency,
                    CategoryId = categoryId,
                    Description = description,
                    OperationDate = date,
                    IsConfirmed = false
                };

                importedOps.Add(op);
            }
            catch
            {
                errors.Add($"Failed to parse line: {dataLine}");
            }
        }

        // We need an accountId for operations - for now skip saving if no account is specified
        // The frontend should pass accountId via the column mapping or as a separate param
        var accountIdStr = form["accountId"].ToString();
        if (!ulong.TryParse(accountIdStr, out var accountId))
        {
            return Results.Ok(new
            {
                preview = importedOps.Take(10),
                totalRows = importedOps.Count,
                errors,
                message = "accountId is required to complete import. Preview only."
            });
        }

        foreach (var op in importedOps)
            op.AccountId = accountId;

        var importedIds = new List<ulong>();
        foreach (var op in importedOps)
        {
            var id = await opRepo.CreateAsync(op);
            importedIds.Add(id);
        }

        await importRepo.CreateSessionAsync(new CsvImportSession
        {
            UserId = userId,
            FileName = file.FileName,
            ColumnMapping = columnMapping,
            OperationsImported = importedOps.Count
        });

        return Results.Ok(new
        {
            imported = importedOps.Count,
            errors,
            message = $"Successfully imported {importedOps.Count} operations"
        });
    }

    private static string[] ParseCsvLine(string line)
    {
        var result = new List<string>();
        var inQuotes = false;
        var sb = new StringBuilder();

        for (int i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (c == '"')
            {
                if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
                {
                    sb.Append('"');
                    i++;
                }
                else
                {
                    inQuotes = !inQuotes;
                }
            }
            else if (c == ',' && !inQuotes)
            {
                result.Add(sb.ToString());
                sb.Clear();
            }
            else
            {
                sb.Append(c);
            }
        }

        result.Add(sb.ToString());
        return result.ToArray();
    }
}
