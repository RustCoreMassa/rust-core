import { pageList } from './pagination';

describe('pageList', () => {
  it('shows every page when there are few', () => {
    expect(pageList(1, 1)).toEqual([1]);
    expect(pageList(2, 3)).toEqual([1, 2, 3]);
  });

  it('keeps the ends and the current page’s neighbours', () => {
    expect(pageList(1, 100)).toEqual([1, 2, null, 100]);
    expect(pageList(50, 100)).toEqual([1, null, 49, 50, 51, null, 100]);
    expect(pageList(100, 100)).toEqual([1, null, 99, 100]);
  });

  it('shows a single left-out page instead of "…"', () => {
    expect(pageList(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageList(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pageList(5, 9)).toEqual([1, null, 4, 5, 6, null, 9]);
  });
});
