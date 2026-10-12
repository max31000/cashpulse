using CashPulse.Api.Auth;
using CashPulse.Core.Interfaces.Repositories;
using CashPulse.Core.Models;
using Moq;
using Xunit;

namespace CashPulse.Tests.Auth;

public class UserProvisioningTests
{
    private readonly Mock<IUserRepository> _users = new();
    private readonly Mock<ICategoryRepository> _categories = new();
    private readonly List<Category> _created = [];

    public UserProvisioningTests()
    {
        ulong nextId = 100;
        _categories.Setup(r => r.CreateAsync(It.IsAny<Category>()))
            .ReturnsAsync((Category c) =>
            {
                c.Id = ++nextId;
                _created.Add(c);
                return c.Id;
            });
    }

    private UserProvisioning Sut() => new(_users.Object, _categories.Object);

    [Fact]
    public async Task NewTelegramUser_IsCreatedWithDefaultCategoryTree()
    {
        _users.Setup(r => r.GetByTelegramIdAsync(42)).ReturnsAsync((User?)null);
        User? inserted = null;
        _users.Setup(r => r.CreateAsync(It.IsAny<User>())).Callback((User u) => inserted = u).ReturnsAsync(7UL);

        var user = await Sut().GetOrCreateAsync(42, "Иван Петров");

        Assert.Equal(7UL, user.Id);
        Assert.NotNull(inserted);
        Assert.Equal(42, inserted!.TelegramId);
        Assert.Equal("Иван Петров", inserted.DisplayName);
        Assert.Equal("RUB", inserted.BaseCurrency);
        Assert.Null(inserted.Email);

        Assert.Equal(17, _created.Count);
        Assert.All(_created, c => Assert.Equal(7UL, c.UserId));
        Assert.All(_created, c => Assert.True(c.IsSystem));

        var roots = _created.Where(c => c.ParentId is null).Select(c => c.Name).ToList();
        Assert.Equal(["Доходы", "Расходы"], roots);
        var income = _created.Single(c => c.Name == "Доходы");
        var expense = _created.Single(c => c.Name == "Расходы");
        var household = _created.Single(c => c.Name == "Быт");
        Assert.Equal(3, _created.Count(c => c.ParentId == income.Id));
        Assert.Equal(expense.Id, household.ParentId);
        Assert.Equal(["Продукты", "Рестораны/Кафе", "Подписки"],
            _created.Where(c => c.ParentId == household.Id).Select(c => c.Name));
    }

    [Fact]
    public async Task ExistingTelegramUser_IsReturnedUnchanged()
    {
        var existing = new User { Id = 2, TelegramId = 343631124, DisplayName = "Старое имя" };
        _users.Setup(r => r.GetByTelegramIdAsync(343631124)).ReturnsAsync(existing);

        var user = await Sut().GetOrCreateAsync(343631124, "Новое имя");

        Assert.Same(existing, user);
        Assert.Equal("Старое имя", user.DisplayName);
        _users.Verify(r => r.CreateAsync(It.IsAny<User>()), Times.Never);
        _users.Verify(r => r.UpdateAsync(It.IsAny<User>()), Times.Never);
        Assert.Empty(_created);
    }

    [Fact]
    public async Task BlankName_FallsBackToTelegramId()
    {
        _users.Setup(r => r.GetByTelegramIdAsync(55)).ReturnsAsync((User?)null);
        User? inserted = null;
        _users.Setup(r => r.CreateAsync(It.IsAny<User>())).Callback((User u) => inserted = u).ReturnsAsync(9UL);

        await Sut().GetOrCreateAsync(55, "  ");

        Assert.Equal("user_55", inserted!.DisplayName);
    }
}
