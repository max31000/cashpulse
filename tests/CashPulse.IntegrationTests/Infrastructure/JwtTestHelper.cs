using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace CashPulse.IntegrationTests.Infrastructure;

/// <summary>
/// Generates JWT tokens for integration tests, matching the format validated by JwtMiddleware.
/// JwtMiddleware reads ClaimTypes.NameIdentifier as UserId and validates Jwt:Secret/Issuer/Audience.
/// </summary>
public static class JwtTestHelper
{
    public const string TestSecret = "cashpulse-integration-test-secret-key-32ch"; // >= 32 chars for HMAC-SHA256
    public const string TestIssuer = "cashpulse";
    public const string TestAudience = "cashpulse";

    public static string GenerateToken(ulong userId, TimeSpan? expiry = null)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(TestSecret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
        };

        var token = new JwtSecurityToken(
            issuer: TestIssuer,
            audience: TestAudience,
            claims: claims,
            expires: DateTime.UtcNow.Add(expiry ?? TimeSpan.FromHours(1)),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
