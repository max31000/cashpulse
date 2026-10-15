using CashPulse.Api.Auth;
using CashPulse.Api.Endpoints;
using CashPulse.Api.Middleware;
using CashPulse.Infrastructure;
using Mvv42.Auth.Client;
using Prometheus;

// Prometheus: process + .NET runtime metrics only; EventCounters and the .NET Meters adapter are off (too many
// series). Must run before any metric is created.
Metrics.SuppressDefaultMetrics(new SuppressDefaultMetricOptions { SuppressEventCounters = true, SuppressMeters = true });

var builder = WebApplication.CreateBuilder(args);

// No CORS: the SPA calls the API same-origin (nginx /cashpulse/api/ in production, the Vite proxy in dev) — the
// mvv42 access cookie is host-only and SameSite=Strict, so cross-origin callers could not authenticate anyway.

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "CashPulse API", Version = "v1" });
});

// Infrastructure DI (repos, services, migration runner)
builder.Services.AddInfrastructure(builder.Configuration);

// Shared mvv42 auth: access JWT from the mvv42 cookie (ES256, JWKS from mvv42-auth), policy `mvv42:app`
// (apps ∋ cashpulse or adm) for every endpoint without explicit metadata. Local user = by `tg` (ICurrentUser).
builder.Services.AddAuthentication(Mvv42Auth.Scheme);
builder.Services.AddMvv42Auth("cashpulse", o => Mvv42AuthConfig.Bind(builder.Configuration, o));
builder.Services.AddAuthorization(o => o.FallbackPolicy = o.GetPolicy(Mvv42Auth.Policy));
builder.Services.AddHttpContextAccessor();
builder.Services.AddMemoryCache();
builder.Services.AddScoped<UserProvisioning>();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();

// Configure JSON options: camelCase + string enums + DateOnly support
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    options.SerializerOptions.Converters.Add(
        new System.Text.Json.Serialization.JsonStringEnumConverter(System.Text.Json.JsonNamingPolicy.CamelCase));
});

// /metrics is served by a separate KestrelMetricServer (container port 9091, published only on the host's
// 127.0.0.1), never by the main app port behind nginx. Metrics:Port = 0 disables it.
var metricsPort = builder.Configuration.GetValue("Metrics:Port", 9091);
if (metricsPort > 0)
    builder.Services.AddMetricServer(o => o.Port = (ushort)metricsPort);

var app = builder.Build();

// Middleware pipeline
app.UseRouting();
// HTTP metrics: endpoint = route template (never the raw path), status code reduced to 2xx/4xx/5xx.
app.UseHttpMetrics(o => o.ReduceStatusCodeCardinality());
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<ErrorHandlingMiddleware>();

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
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }))
   .AllowAnonymous();

app.Run();

// Needed for WebApplicationFactory<Program> in integration tests
public partial class Program { };
