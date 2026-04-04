namespace CashPulse.Api.Middleware;

public class DevUserMiddleware
{
    private readonly RequestDelegate _next;

    public DevUserMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        // MVP: always use UserId=1, no authentication
        context.Items["UserId"] = (ulong)1;
        await _next(context);
    }
}
