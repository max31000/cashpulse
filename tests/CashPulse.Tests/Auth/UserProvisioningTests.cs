using System.Reflection;
using CashPulse.Api.Auth;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;
using Moq;
using MySqlConnector;
using Xunit;

namespace CashPulse.Tests.Auth;

public class UserProvisioningTests
{
    private readonly Mock<IUserRepository> _users = new();

    private UserProvisioning Sut() => new(_users.Object);

    /// <summary>MySqlException has no public constructor; build the one MySQL raises for 1062.</summary>
    internal static MySqlException DuplicateKey()
    {
        var ctor = typeof(MySqlException)
            .GetConstructors(BindingFlags.NonPublic | BindingFlags.Instance)
            .First(c => c.GetParameters().Select(p => p.ParameterType).SequenceEqual([typeof(MySqlErrorCode), typeof(string), typeof(string)]));
        return (MySqlException)ctor.Invoke([MySqlErrorCode.DuplicateKeyEntry, "23000", "Duplicate entry for key 'uq_users_telegram_id'"]);
    }

    private static IEnumerable<CategorySeed> Flatten(IEnumerable<CategorySeed> seeds) =>
        seeds.SelectMany(s => new[] { s }.Concat(Flatten(s.Children ?? [])));

    [Fact]
    public void DefaultCategoryTree_MatchesTheLegacySeed()
    {
        var all = Flatten(UserProvisioning.DefaultCategories).ToList();
        Assert.Equal(17, all.Count);
        Assert.Equal(["Доходы", "Расходы"], UserProvisioning.DefaultCategories.Select(c => c.Name));
        Assert.Equal(["ЗП", "Инвестиции (доход)", "Прочие доходы"], UserProvisioning.DefaultCategories[0].Children!.Select(c => c.Name));
        var household = all.Single(c => c.Name == "Быт");
        Assert.Equal(["Продукты", "Рестораны/Кафе", "Подписки"], household.Children!.Select(c => c.Name));
    }

    [Fact]
    public async Task NewTelegramUser_IsCreatedWithCategoriesInOneCall()
    {
        _users.Setup(r => r.GetByTelegramIdAsync(42)).ReturnsAsync((User?)null);
        User? inserted = null;
        _users.Setup(r => r.CreateWithCategoriesAsync(It.IsAny<User>(), UserProvisioning.DefaultCategories))
            .Callback((User u, IReadOnlyList<CategorySeed> _) => inserted = u)
            .ReturnsAsync(7UL);

        var user = await Sut().GetOrCreateAsync(42, "Иван Петров");

        Assert.Equal(7UL, user.Id);
        Assert.Equal(42, inserted!.TelegramId);
        Assert.Equal("Иван Петров", inserted.DisplayName);
        Assert.Equal("RUB", inserted.BaseCurrency);
        Assert.Null(inserted.Email);
        _users.Verify(r => r.CreateAsync(It.IsAny<User>()), Times.Never);
    }

    [Fact]
    public async Task ExistingTelegramUser_IsReturnedUnchanged()
    {
        var existing = new User { Id = 2, TelegramId = 343631124, DisplayName = "Старое имя" };
        _users.Setup(r => r.GetByTelegramIdAsync(343631124)).ReturnsAsync(existing);

        var user = await Sut().GetOrCreateAsync(343631124, "Новое имя");

        Assert.Same(existing, user);
        Assert.Equal("Старое имя", user.DisplayName);
        _users.Verify(r => r.CreateWithCategoriesAsync(It.IsAny<User>(), It.IsAny<IReadOnlyList<CategorySeed>>()), Times.Never);
        _users.Verify(r => r.UpdateAsync(It.IsAny<User>()), Times.Never);
    }

    [Fact]
    public async Task DuplicateKeyRace_ReturnsTheRowCommittedByTheOtherWriter()
    {
        var winner = new User { Id = 11, TelegramId = 99, DisplayName = "Other process" };
        _users.SetupSequence(r => r.GetByTelegramIdAsync(99))
            .ReturnsAsync((User?)null)  // fast path
            .ReturnsAsync((User?)null)  // inside the gate
            .ReturnsAsync(winner);      // after 1062
        _users.Setup(r => r.CreateWithCategoriesAsync(It.IsAny<User>(), It.IsAny<IReadOnlyList<CategorySeed>>()))
            .ThrowsAsync(DuplicateKey());

        var user = await Sut().GetOrCreateAsync(99, "Me");

        Assert.Same(winner, user);
    }

    [Fact]
    public async Task DuplicateKeyWithoutRow_Throws()
    {
        _users.Setup(r => r.GetByTelegramIdAsync(98)).ReturnsAsync((User?)null);
        _users.Setup(r => r.CreateWithCategoriesAsync(It.IsAny<User>(), It.IsAny<IReadOnlyList<CategorySeed>>()))
            .ThrowsAsync(DuplicateKey());

        await Assert.ThrowsAsync<InvalidOperationException>(() => Sut().GetOrCreateAsync(98, "Me"));
    }

    [Fact]
    public async Task OtherDatabaseErrors_AreNotSwallowed()
    {
        _users.Setup(r => r.GetByTelegramIdAsync(97)).ReturnsAsync((User?)null);
        _users.Setup(r => r.CreateWithCategoriesAsync(It.IsAny<User>(), It.IsAny<IReadOnlyList<CategorySeed>>()))
            .ThrowsAsync(new TimeoutException());

        await Assert.ThrowsAsync<TimeoutException>(() => Sut().GetOrCreateAsync(97, "Me"));
    }

    [Fact]
    public async Task ParallelFirstRequestsOfOneUser_CreateOnce()
    {
        User? stored = null;
        _users.Setup(r => r.GetByTelegramIdAsync(55)).ReturnsAsync(() => stored);
        var creates = 0;
        _users.Setup(r => r.CreateWithCategoriesAsync(It.IsAny<User>(), It.IsAny<IReadOnlyList<CategorySeed>>()))
            .Returns(async (User u, IReadOnlyList<CategorySeed> _) =>
            {
                Interlocked.Increment(ref creates);
                await Task.Delay(20);
                stored = new User { Id = 30, TelegramId = u.TelegramId, DisplayName = u.DisplayName };
                return 30UL;
            });

        var ids = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => Sut().GetOrCreateAsync(55, "Burst")));

        Assert.All(ids, u => Assert.Equal(30UL, u.Id));
        Assert.Equal(1, creates);
    }

    [Fact]
    public async Task BlankName_FallsBackToTelegramId()
    {
        _users.Setup(r => r.GetByTelegramIdAsync(56)).ReturnsAsync((User?)null);
        User? inserted = null;
        _users.Setup(r => r.CreateWithCategoriesAsync(It.IsAny<User>(), It.IsAny<IReadOnlyList<CategorySeed>>()))
            .Callback((User u, IReadOnlyList<CategorySeed> _) => inserted = u)
            .ReturnsAsync(9UL);

        await Sut().GetOrCreateAsync(56, "  ");

        Assert.Equal("user_56", inserted!.DisplayName);
    }
}
