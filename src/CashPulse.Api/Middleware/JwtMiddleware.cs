using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace CashPulse.Api.Middleware;

/// <summary>
/// Читает JWT из заголовка Authorization: Bearer {token},
/// валидирует его и кладёт UserId в HttpContext.Items["UserId"].
/// 
/// Если токен отсутствует или невалиден — возвращает 401.
/// Публичные маршруты (health, /api/auth/telegram) пропускаются без проверки.
/// </summary>
public class JwtMiddleware
{
    private readonly RequestDelegate _next;
    private readonly string _secret;
    private readonly string _issuer;
    private readonly string _audience;

    // Маршруты, доступные без токена
    private static readonly HashSet<string> _publicPaths =
    [
        "/health",
        "/api/auth/telegram",
        "/swagger",
        "/swagger/v1/swagger.json",
    ];

    public JwtMiddleware(RequestDelegate next, IConfiguration configuration)
    {
        _next = next;
        _secret   = configuration["Jwt:Secret"]   ?? throw new InvalidOperationException("Jwt:Secret не настроен");
        _issuer   = configuration["Jwt:Issuer"]   ?? "cashpulse";
        _audience = configuration["Jwt:Audience"] ?? "cashpulse";
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? string.Empty;

        // Пропускаем публичные маршруты
        if (IsPublicPath(path))
        {
            await _next(context);
            return;
        }

        var token = ExtractToken(context);
        if (token is null)
        {
            context.Response.StatusCode = 401;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync("{\"error\":\"Требуется авторизация\"}");
            return;
        }

        var userId = ValidateToken(token);
        if (userId is null)
        {
            context.Response.StatusCode = 401;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync("{\"error\":\"Токен недействителен или истёк\"}");
            return;
        }

        context.Items["UserId"] = userId.Value;
        await _next(context);
    }

    private static string? ExtractToken(HttpContext context)
    {
        var header = context.Request.Headers.Authorization.FirstOrDefault();
        if (header?.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) == true)
            return header["Bearer ".Length..].Trim();
        return null;
    }

    private ulong? ValidateToken(string token)
    {
        try
        {
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secret));
            var handler = new JwtSecurityTokenHandler();

            var parameters = new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey         = key,
                ValidateIssuer           = true,
                ValidIssuer              = _issuer,
                ValidateAudience         = true,
                ValidAudience            = _audience,
                ValidateLifetime         = true,
                ClockSkew                = TimeSpan.FromSeconds(30),
            };

            var principal = handler.ValidateToken(token, parameters, out _);
            var sub = principal.FindFirstValue(ClaimTypes.NameIdentifier);

            if (ulong.TryParse(sub, out var userId))
                return userId;

            return null;
        }
        catch
        {
            return null;
        }
    }

    private static bool IsPublicPath(string path) =>
        _publicPaths.Any(p => path.StartsWith(p, StringComparison.OrdinalIgnoreCase));
}
