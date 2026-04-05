namespace CashPulse.Core.Models;

public class User
{
    public ulong Id { get; set; }
    public string? GoogleSubjectId { get; set; }
    public long? TelegramId { get; set; }
    public string? Email { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string BaseCurrency { get; set; } = "RUB";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
