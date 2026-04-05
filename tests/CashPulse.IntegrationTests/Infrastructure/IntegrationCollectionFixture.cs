using Xunit;

namespace CashPulse.IntegrationTests.Infrastructure;

[CollectionDefinition("Integration")]
public class IntegrationCollection : ICollectionFixture<TestWebApplicationFactory> { }
