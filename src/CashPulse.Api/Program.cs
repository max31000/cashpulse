using CashPulse.Api.Endpoints;
using CashPulse.Api.Middleware;
using CashPulse.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

// CORS — origins читаются из конфига, чтобы не хардкодить IP/домен в коде
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        var origins = builder.Configuration
            .GetSection("Cors:AllowedOrigins")
            .Get<string[]>()
            ?? ["http://localhost:5173"];
        policy.WithOrigins(origins)
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "CashPulse API", Version = "v1" });
});

// Infrastructure DI (repos, services, migration runner)
builder.Services.AddInfrastructure(builder.Configuration);

// Configure JSON options: camelCase + string enums + DateOnly support
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    options.SerializerOptions.Converters.Add(
        new System.Text.Json.Serialization.JsonStringEnumConverter(System.Text.Json.JsonNamingPolicy.CamelCase));
});

var app = builder.Build();

// Middleware pipeline
app.UseCors();
app.UseMiddleware<ErrorHandlingMiddleware>();
app.UseMiddleware<JwtMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "CashPulse API v1");
    });
}

// Run database migrations (skipped in Testing environment — handled by DatabaseFixture)
if (!app.Environment.IsEnvironment("Testing"))
{
    try
    {
        var migrationRunner = app.Services.GetRequiredService<MigrationRunner>();
        await migrationRunner.RunAsync();
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "Failed to run database migrations");
        throw;
    }
}

// Map API endpoints
app.MapAuthEndpoints();
app.MapAccountsEndpoints();
app.MapOperationsEndpoints();
app.MapCategoriesEndpoints();
app.MapScenariosEndpoints();
app.MapForecastEndpoints();
app.MapTagsEndpoints();
app.MapExchangeRatesEndpoints();
app.MapImportEndpoints();
app.MapBalanceSnapshotsEndpoints();
app.MapIncomeSourceEndpoints();

// Health check
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

app.Run();

// Needed for WebApplicationFactory<Program> in integration tests
public partial class Program { };
