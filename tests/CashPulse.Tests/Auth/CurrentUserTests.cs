using System.Security.Claims;
using CashPulse.Api.Auth;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Caching.Memory;
using Moq;
using Mvv42.Auth.Client;
using Xunit;

namespace CashPulse.Tests.Auth;

public class CurrentUserTests
{
    private readonly Mock<IUserRepository> _users = new();

    private static ClaimsPrincipal Mvv42Principal(string sub, long tg, string name = "Test") =>
        new(new ClaimsIdentity(
            [new Claim("sub", sub), new Claim("tg", tg.ToString()), new Claim("name", name), new Claim("apps", "cashpulse")],
            Mvv42Auth.Scheme));

    private CurrentUser Sut(ClaimsPrincipal? principal, IMemoryCache? cache = null)
    {
        var ctx = new DefaultHttpContext();
        if (principal is not null) ctx.User = principal;
        var accessor = new HttpContextAccessor { HttpContext = ctx };
        return new CurrentUser(accessor, new UserProvisioning(_users.Object),
            cache ?? new MemoryCache(new MemoryCacheOptions()));
    }

    [Fact]
    public async Task LocalId_ComesFromTelegramId_NeverFromSub()
    {
        // sub = 1 (auth user id) must not be mistaken for local user 1.
        _users.Setup(r => r.GetByTelegramIdAsync(343631124))
            .ReturnsAsync(new User { Id = 2, TelegramId = 343631124, DisplayName = "Owner" });

        var id = await Sut(Mvv42Principal(sub: "1", tg: 343631124)).GetIdAsync();

        Assert.Equal(2UL, id);
        _users.Verify(r => r.GetByIdAsync(It.IsAny<ulong>()), Times.Never);
    }

    [Fact]
    public async Task UnknownTelegramId_ProvisionsUser()
    {
        _users.Setup(r => r.GetByTelegramIdAsync(777)).ReturnsAsync((User?)null);
        _users.Setup(r => r.CreateWithCategoriesAsync(It.Is<User>(u => u.TelegramId == 777 && u.DisplayName == "Новичок"), UserProvisioning.DefaultCategories))
            .ReturnsAsync(15UL);

        var id = await Sut(Mvv42Principal(sub: "15000", tg: 777, name: "Новичок")).GetIdAsync();

        Assert.Equal(15UL, id);
        _users.Verify(r => r.CreateWithCategoriesAsync(It.IsAny<User>(), It.IsAny<IReadOnlyList<CategorySeed>>()), Times.Once);
    }

    [Fact]
    public async Task Id_IsCachedPerTelegramId()
    {
        _users.Setup(r => r.GetByTelegramIdAsync(42)).ReturnsAsync(new User { Id = 5, TelegramId = 42 });
        var cache = new MemoryCache(new MemoryCacheOptions());

        await Sut(Mvv42Principal("9", 42), cache).GetIdAsync();
        await Sut(Mvv42Principal("9", 42), cache).GetIdAsync();

        _users.Verify(r => r.GetByTelegramIdAsync(42), Times.Once);
    }

    [Fact]
    public async Task NoMvv42Identity_Throws401Exception()
    {
        // e.g. an identity of another scheme carrying a sub — not an mvv42 user.
        var foreign = new ClaimsPrincipal(new ClaimsIdentity([new Claim("sub", "1"), new Claim("tg", "1")], "Bearer"));

        await Assert.ThrowsAsync<UnauthenticatedException>(() => Sut(foreign).GetIdAsync());
        await Assert.ThrowsAsync<UnauthenticatedException>(() => Sut(null).GetIdAsync());
    }
}
