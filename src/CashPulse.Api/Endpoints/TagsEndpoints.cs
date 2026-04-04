using CashPulse.Core.Services;

namespace CashPulse.Api.Endpoints;

public static class TagsEndpoints
{
    public static void MapTagsEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/tags");
        group.MapGet("/summary", GetTagsSummary);
    }

    private static async Task<IResult> GetTagsSummary(
        HttpContext ctx,
        IForecastService forecastService)
    {
        var userId = (ulong)ctx.Items["UserId"]!;
        // Build forecast with 0 months just to get tag summaries (short horizon)
        var result = await forecastService.BuildForecastAsync(userId, 1, false);
        return Results.Ok(result.TagSummaries);
    }
}
