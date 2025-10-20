import { newE2EPage } from '@stencil/core/testing';

describe('app-root', () => {
  it('renders the shell and navigation', async () => {
    const page = await newE2EPage({ url: '/' });
    const element = await page.find('app-root');
    expect(element).toHaveClass('hydrated');

    const title = await page.find('app-root >>> .title');
    expect(title.textContent).toEqual('Mir Sinn');

    const navButtons = await page.findAll('app-root >>> .nav-button');
    expect(navButtons.length).toBe(2);
  });
});
