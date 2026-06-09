vi.stubEnv('SERVER', 'https://my-tableau-server.com');
vi.stubEnv('SITE_NAME', 'tc25');
vi.stubEnv('PAT_NAME', 'sponge');
vi.stubEnv('PAT_VALUE', 'bob');
vi.stubEnv('TABLEAU_MCP_TEST', 'true');
vi.stubEnv(
  'TABLEAU_INSTANCES',
  JSON.stringify([
    {
      name: 'test',
      server: 'https://my-tableau-server.com',
      siteName: 'tc25',
      auth: 'pat',
      patName: 'sponge',
      patValue: 'bob',
      enabled: true,
      priority: 5,
    },
  ]),
);

vi.mock('./server.js', async (importOriginal) => ({
  ...(await importOriginal()),
  Server: vi.fn().mockImplementation(() => ({
    name: 'test-server',
    server: {
      notification: vi.fn(),
    },
  })),
}));
