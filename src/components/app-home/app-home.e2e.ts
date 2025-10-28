import { newE2EPage } from '@stencil/core/testing';

describe('app-home', () => {
  it('renders', async () => {
    const page = await newE2EPage();
    await page.setContent('<app-home></app-home>');

    const element = await page.find('app-home');
    expect(element).toHaveClass('hydrated');
  });

  it('renders five question panels', async () => {
    const page = await newE2EPage();
    await page.setContent('<app-home></app-home>');

    const panels = await page.findAll('app-home >>> .question-panel');
    expect(panels.length).toEqual(5);
  });

  it('shows the questions heading', async () => {
    const page = await newE2EPage();
    await page.setContent('<app-home language="en"></app-home>');

    const heading = await page.find('app-home >>> .page-header h1');
    expect(heading.textContent).toEqual('Questions of the day');
  });
});
