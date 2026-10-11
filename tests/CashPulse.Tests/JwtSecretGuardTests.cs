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
    [InlineData("dev-secret-change-in-production-min-32-chars!!")]
    [InlineData("dev-secret-change-me-min-32-characters!!")]
    [InlineData("dev-only-secret-key-do-not-use-in-prod-32chars")]
    [InlineData("prod-but-still-a-DEV-SECRET-0123456789abcdef")]
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
