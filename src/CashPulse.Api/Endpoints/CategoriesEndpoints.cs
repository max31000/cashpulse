using CashPulse.Api.Middleware;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;

namespace CashPulse.Api.Endpoints;

public static class CategoriesEndpoints
{
    public static void MapCategoriesEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/categories");

        group.MapGet("/", GetCategories);
        group.MapPost("/", CreateCategory);
        group.MapPut("/{id:long}", UpdateCategory);
        group.MapDelete("/{id:long}", DeleteCategory);
    }

    private static async Task<IResult> GetCategories(HttpContext ctx, ICategoryRepository repo)
    {
        var userId = GetUserId(ctx);
        var categories = await repo.GetByUserIdAsync(userId);
        return Results.Ok(categories);
    }

    private static async Task<IResult> CreateCategory(CategoryRequest req, HttpContext ctx, ICategoryRepository repo)
    {
        var userId = GetUserId(ctx);

        if (string.IsNullOrWhiteSpace(req.Name))
            throw new ValidationException("Name is required");

        var category = new Category
        {
            UserId = userId,
            Name = req.Name.Trim(),
            ParentId = req.ParentId.HasValue ? (ulong)req.ParentId.Value : null,
            Icon = req.Icon,
            Color = req.Color,
            IsSystem = false,
            SortOrder = req.SortOrder
        };

        var id = await repo.CreateAsync(category);
        var created = await repo.GetByIdAsync(id, userId);
        return Results.Created($"/api/categories/{id}", created);
    }

    private static async Task<IResult> UpdateCategory(long id, CategoryRequest req, HttpContext ctx, ICategoryRepository repo)
    {
        var userId = GetUserId(ctx);
        var existing = await repo.GetByIdAsync((ulong)id, userId)
            ?? throw new NotFoundException($"Category {id} not found");

        if (existing.IsSystem)
            throw new ValidationException("Cannot modify system categories");

        existing.Name = req.Name?.Trim() ?? existing.Name;
        existing.ParentId = req.ParentId.HasValue ? (ulong)req.ParentId.Value : existing.ParentId;
        existing.Icon = req.Icon ?? existing.Icon;
        existing.Color = req.Color ?? existing.Color;
        existing.SortOrder = req.SortOrder;

        await repo.UpdateAsync(existing);
        return Results.Ok(existing);
    }

    private static async Task<IResult> DeleteCategory(long id, HttpContext ctx, ICategoryRepository repo)
    {
        var userId = GetUserId(ctx);
        var existing = await repo.GetByIdAsync((ulong)id, userId)
            ?? throw new NotFoundException($"Category {id} not found");

        if (existing.IsSystem)
            throw new ValidationException("Cannot delete system categories");

        var success = await repo.DeleteAsync((ulong)id, userId);
        if (!success) throw new NotFoundException($"Category {id} not found");
        return Results.NoContent();
    }

    private static ulong GetUserId(HttpContext ctx) => (ulong)ctx.Items["UserId"]!;
}

public record CategoryRequest(
    string? Name,
    long? ParentId,
    string? Icon,
    string? Color,
    int SortOrder = 0);
