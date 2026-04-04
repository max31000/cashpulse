namespace CashPulse.Core.Models;

public class Category
{
    public ulong Id { get; set; }
    public ulong UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public ulong? ParentId { get; set; }
    public string? Icon { get; set; }
    public string? Color { get; set; }
    public bool IsSystem { get; set; }
    public int SortOrder { get; set; }
}
