namespace CashPulse.Core.Models;

public class RecurrenceRule
{
    public ulong Id { get; set; }
    public RecurrenceType Type { get; set; }
    public int? DayOfMonth { get; set; }
    public int? Interval { get; set; }  // maps to Interval_ in DB
    public List<int>? DaysOfWeek { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
}

public enum RecurrenceType
{
    Daily,
    Weekly,
    Biweekly,
    Monthly,
    Quarterly,
    Yearly,
    Custom
}
