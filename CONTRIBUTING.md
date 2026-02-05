# Contributing to Amped DeFi Plugin

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/amped-finance/amped-defi.git
   cd amped-defi/packages/amped-defi-plugin
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Run tests**
   ```bash
   npm test
   ```

## Project Structure

```
src/
├── tools/           # OpenClaw tool implementations
├── utils/           # Utility functions
├── policy/          # Policy engine
├── wallet/          # Wallet registry
├── providers/       # Spoke provider factory
├── sodax/           # SODAX SDK client
└── __tests__/       # Test files
```

## Coding Standards

- **TypeScript**: Use strict mode
- **Linting**: ESLint with TypeScript parser
- **Testing**: Jest with minimum 50% coverage
- **Documentation**: JSDoc comments for all public APIs

## Making Changes

1. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow existing code style
   - Add tests for new functionality
   - Update documentation

3. **Run checks**
   ```bash
   npm run typecheck
   npm run lint
   npm test
   ```

4. **Commit**
   ```bash
   git commit -m "feat: add new feature"
   ```

## Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Test changes
- `refactor:` Code refactoring
- `chore:` Maintenance tasks

## Pull Request Process

1. Update documentation for any changed functionality
2. Ensure all tests pass
3. Update the CHANGELOG.md
4. Request review from maintainers

## Code Review

All submissions require review. We aim to respond within 48 hours.

## Testing Guidelines

- Unit tests for all utility functions
- Integration tests for tool handlers
- Mock external dependencies (SODAX SDK, API calls)

Example test:
```typescript
describe('MyFeature', () => {
  it('should do something', async () => {
    const result = await myFunction();
    expect(result).toBe(expected);
  });
});
```

## Questions?

- Open an issue for bugs
- Start a discussion for feature requests
- Join our Discord for general questions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
