namespace CashPulse.Core.Models;

/// <summary>A system category created for every new user (with its sub-categories, in this order).</summary>
public sealed record CategorySeed(string Name, IReadOnlyList<CategorySeed>? Children = null);
