import '@testing-library/jest-dom';
import { server } from './msw-handlers';
import { beforeAll, afterEach, afterAll } from 'vitest';

// Mantine uses window.matchMedia for color-scheme detection — jsdom doesn't implement it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mantine SegmentedControl (FloatingIndicator) uses ResizeObserver — jsdom doesn't implement it.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock;

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
