using CashPulse.Api.Auth;
using CashPulse.Api.Middleware;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;

namespace CashPulse.Api.Endpoints;

public static class ScenariosEndpoints
{
    public static void MapScenariosEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/scenarios");

        group.MapGet("/", GetScenarios);
        group.MapPost("/", CreateScenario);
        group.MapPut("/{id:long}", UpdateScenario);
        group.MapDelete("/{id:long}", DeleteScenario);
        group.MapPut("/{id:long}/toggle", ToggleScenario);
    }

    private static async Task<IResult> GetScenarios(ICurrentUser currentUser, IScenarioRepository repo)
    {
        var userId = await currentUser.GetIdAsync();
        var scenarios = await repo.GetByUserIdAsync(userId);
        return Results.Ok(scenarios);
    }

    private static async Task<IResult> CreateScenario(ScenarioRequest req, ICurrentUser currentUser, IScenarioRepository repo)
    {
        var userId = await currentUser.GetIdAsync();

        if (string.IsNullOrWhiteSpace(req.Name))
            throw new ValidationException("Name is required");

        var scenario = new Scenario
        {
            UserId = userId,
            Name = req.Name.Trim(),
            Description = req.Description?.Trim(),
            IsActive = false
        };

        var id = await repo.CreateAsync(scenario);
        var created = await repo.GetByIdAsync(id, userId);
        return Results.Created($"/api/scenarios/{id}", created);
    }

    private static async Task<IResult> UpdateScenario(long id, ScenarioRequest req, ICurrentUser currentUser, IScenarioRepository repo)
    {
        var userId = await currentUser.GetIdAsync();
        var existing = await repo.GetByIdAsync((ulong)id, userId)
            ?? throw new NotFoundException($"Scenario {id} not found");

        existing.Name = req.Name?.Trim() ?? existing.Name;
        existing.Description = req.Description?.Trim() ?? existing.Description;

        await repo.UpdateAsync(existing);
        return Results.Ok(existing);
    }

    private static async Task<IResult> DeleteScenario(long id, ICurrentUser currentUser, IScenarioRepository repo)
    {
        var userId = await currentUser.GetIdAsync();
        var success = await repo.DeleteAsync((ulong)id, userId);
        if (!success) throw new NotFoundException($"Scenario {id} not found");
        return Results.NoContent();
    }

    private static async Task<IResult> ToggleScenario(long id, ICurrentUser currentUser, IScenarioRepository repo)
    {
        var userId = await currentUser.GetIdAsync();
        var success = await repo.ToggleActiveAsync((ulong)id, userId);
        if (!success) throw new NotFoundException($"Scenario {id} not found");
        var scenario = await repo.GetByIdAsync((ulong)id, userId);
        return Results.Ok(scenario);
    }

}

public record ScenarioRequest(string? Name, string? Description);
