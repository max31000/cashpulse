using CashPulse.Api.Middleware;
using Xunit;

namespace CashPulse.Tests;

public class JwtMiddlewarePublicPathTests
{
    [Theory]
    [InlineData("/health")]
    [InlineData("/health/")]
    [InlineData("/api/auth/telegram")]
    [InlineData("/api/auth/telegram/")]
    [InlineData("/swagger")]
    [InlineData("/swagger/index.html")]
    public void IsPublicPath_PublicRoutes_ReturnsTrue(string path)
    {
        Assert.True(JwtMiddleware.IsPublicPath(path));
    }

    [Theory]
    [InlineData("/healthz")]
    [InlineData("/api/auth/telegramX")]
    [InlineData("/swaggerX")]
    [InlineData("/api/accounts")]
    [InlineData("")]
    public void IsPublicPath_ProtectedRoutes_ReturnsFalse(string path)
    {
        Assert.False(JwtMiddleware.IsPublicPath(path));
    }
}
