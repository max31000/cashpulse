namespace CashPulse.Core.Models;

public class CsvImportSession
{
    public ulong Id { get; set; }
    public ulong UserId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public Dictionary<string, string> ColumnMapping { get; set; } = new();
    public DateTime ImportedAt { get; set; }
    public int OperationsImported { get; set; }
}
