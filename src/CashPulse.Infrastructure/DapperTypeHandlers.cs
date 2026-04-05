using System.Data;
using Dapper;

namespace CashPulse.Infrastructure;

/// <summary>
/// Dapper TypeHandler для System.DateOnly.
/// Dapper из коробки не поддерживает DateOnly (появился в .NET 6),
/// поэтому нужно явно указать как конвертировать в/из SQL DATE.
/// Регистрируется один раз при старте через DapperTypeHandlers.Register().
/// </summary>
public class DateOnlyTypeHandler : SqlMapper.TypeHandler<DateOnly>
{
    public override void SetValue(IDbDataParameter parameter, DateOnly value)
    {
        parameter.DbType = DbType.Date;
        parameter.Value = value.ToDateTime(TimeOnly.MinValue);
    }

    public override DateOnly Parse(object value)
    {
        return value switch
        {
            DateTime dt       => DateOnly.FromDateTime(dt),
            DateOnly d        => d,
            string s          => DateOnly.Parse(s),
            _                 => DateOnly.FromDateTime(Convert.ToDateTime(value)),
        };
    }
}

/// <summary>
/// Dapper TypeHandler для System.DateOnly? (nullable).
/// </summary>
public class NullableDateOnlyTypeHandler : SqlMapper.TypeHandler<DateOnly?>
{
    public override void SetValue(IDbDataParameter parameter, DateOnly? value)
    {
        parameter.DbType = DbType.Date;
        parameter.Value = value.HasValue
            ? value.Value.ToDateTime(TimeOnly.MinValue)
            : DBNull.Value;
    }

    public override DateOnly? Parse(object value)
    {
        if (value == null || value == DBNull.Value) return null;
        return value switch
        {
            DateTime dt => DateOnly.FromDateTime(dt),
            DateOnly d  => d,
            string s    => DateOnly.Parse(s),
            _           => DateOnly.FromDateTime(Convert.ToDateTime(value)),
        };
    }
}

/// <summary>
/// Точка регистрации всех кастомных TypeHandler'ов Dapper.
/// Вызывать один раз при старте приложения (в DependencyInjection.AddInfrastructure).
/// </summary>
public static class DapperTypeHandlers
{
    private static bool _registered;
    private static readonly object _lock = new();

    public static void Register()
    {
        if (_registered) return;
        lock (_lock)
        {
            if (_registered) return;
            SqlMapper.AddTypeHandler(new DateOnlyTypeHandler());
            SqlMapper.AddTypeHandler(new NullableDateOnlyTypeHandler());
            _registered = true;
        }
    }
}
