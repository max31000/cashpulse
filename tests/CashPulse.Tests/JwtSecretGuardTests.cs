using CashPulse.Infrastructure.Services;
using Xunit;

namespace CashPulse.Tests;

public class JwtSecretGuardTests
{
    private const string StrongSecret = "a-real-production-secret-of-sufficient-length-42";

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("too-short-secret")]
    [InlineData(JwtSecretGuard.DevSecret)]
    public void EnsureValid_Production_InvalidSecret_Throws(string? secret)
    {
        Assert.Throws<InvalidOperationException>(() => JwtSecretGuard.EnsureValid(secret, isDevelopmentOrTesting: false));
    }

    [Fact]
    public void EnsureValid_Production_StrongSecret_DoesNotThrow()
    {
        JwtSecretGuard.EnsureValid(StrongSecret, isDevelopmentOrTesting: false);
    }

    [Theory]
    [InlineData(null)]
    [InlineData(JwtSecretGuard.DevSecret)]
    public void EnsureValid_DevelopmentOrTesting_AnySecret_DoesNotThrow(string? secret)
    {
        JwtSecretGuard.EnsureValid(secret, isDevelopmentOrTesting: true);
    }
}
