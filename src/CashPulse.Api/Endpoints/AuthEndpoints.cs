using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;
using CashPulse.Core.Services;
using Microsoft.IdentityModel.Tokens;

namespace CashPulse.Api.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        app.MapPost("/api/auth/telegram", TelegramLogin);
    }

    /// <summary>
    /// Принимает данные от Telegram Login Widget, проверяет подпись,
    /// создаёт или находит пользователя, возвращает JWT.
    /// </summary>
    private static async Task<IResult> TelegramLogin(
        TelegramAuthData data,
        ITelegramAuthService telegramAuth,
        IUserRepository userRepo,
        IConfiguration config,
        ICategoryRepository categoryRepo)
    {
        // 1. Проверяем подпись Telegram
        if (!telegramAuth.ValidateAuthData(data))
            return Results.Json(new { error = "Недействительные данные авторизации Telegram" },
                statusCode: 401);

        // 2. Находим или создаём пользователя
        var user = await userRepo.GetByTelegramIdAsync(data.Id);
        if (user is null)
        {
            user = new User
            {
                TelegramId  = data.Id,
                DisplayName = BuildDisplayName(data),
                Email       = null,
                BaseCurrency = "RUB",
            };
            var newId = await userRepo.CreateAsync(user);
            user.Id = newId;

            // Создаём системные категории для нового пользователя
            await SeedCategoriesForUser(user.Id, categoryRepo);
        }
        else
        {
            // Обновляем имя если изменилось (пользователь мог переименоваться в Telegram)
            var newName = BuildDisplayName(data);
            if (user.DisplayName != newName)
            {
                user.DisplayName = newName;
                await userRepo.UpdateAsync(user);
            }
        }

        // 3. Выдаём JWT
        var token = GenerateJwt(user, config);

        return Results.Ok(new
        {
            accessToken = token,
            user = new
            {
                id           = user.Id,
                displayName  = user.DisplayName,
                baseCurrency = user.BaseCurrency,
                telegramId   = user.TelegramId,
            }
        });
    }

    private static string BuildDisplayName(TelegramAuthData data)
    {
        var name = string.Join(" ", new[] { data.FirstName, data.LastName }
            .Where(s => !string.IsNullOrEmpty(s)));
        return string.IsNullOrEmpty(name) ? data.Username ?? $"user_{data.Id}" : name;
    }

    private static string GenerateJwt(User user, IConfiguration config)
    {
        var secret   = config["Jwt:Secret"]   ?? throw new InvalidOperationException("Jwt:Secret не настроен");
        var issuer   = config["Jwt:Issuer"]   ?? "cashpulse";
        var audience = config["Jwt:Audience"] ?? "cashpulse";
        var expDays  = int.TryParse(config["Jwt:ExpirationDays"], out var d) ? d : 30;

        var key   = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.DisplayName),
            new Claim("telegram_id", user.TelegramId.ToString()!),
        };

        var token = new JwtSecurityToken(
            issuer:             issuer,
            audience:           audience,
            claims:             claims,
            expires:            DateTime.UtcNow.AddDays(expDays),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// <summary>
    /// Создаёт стандартный набор системных категорий для нового пользователя.
    /// </summary>
    private static async Task SeedCategoriesForUser(ulong userId, ICategoryRepository categoryRepo)
    {
        // Корневые категории
        var incomeId  = await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Доходы",  IsSystem = true, SortOrder = 0 });
        var expenseId = await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Расходы", IsSystem = true, SortOrder = 1 });

        // Доходы
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "ЗП",                   ParentId = incomeId,  IsSystem = true, SortOrder = 0 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Инвестиции (доход)",    ParentId = incomeId,  IsSystem = true, SortOrder = 1 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Прочие доходы",         ParentId = incomeId,  IsSystem = true, SortOrder = 2 });

        // Расходы
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Ипотека",              ParentId = expenseId, IsSystem = true, SortOrder = 0 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Кредитка (погашение)",  ParentId = expenseId, IsSystem = true, SortOrder = 1 });
        var bytId = await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Быт",       ParentId = expenseId, IsSystem = true, SortOrder = 2 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Продукты",              ParentId = bytId,     IsSystem = true, SortOrder = 0 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Рестораны/Кафе",        ParentId = bytId,     IsSystem = true, SortOrder = 1 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Подписки",              ParentId = bytId,     IsSystem = true, SortOrder = 2 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Транспорт",             ParentId = expenseId, IsSystem = true, SortOrder = 3 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Поездки",               ParentId = expenseId, IsSystem = true, SortOrder = 4 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Ремонт",                ParentId = expenseId, IsSystem = true, SortOrder = 5 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Здоровье/Медицина",     ParentId = expenseId, IsSystem = true, SortOrder = 6 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Образование",           ParentId = expenseId, IsSystem = true, SortOrder = 7 });
        await categoryRepo.CreateAsync(new Category { UserId = userId, Name = "Прочее",                ParentId = expenseId, IsSystem = true, SortOrder = 8 });
    }
}
