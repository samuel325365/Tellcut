// common.notecard's checklist layout: two columns only when the widest item fits half the card, whatever the size.
import { expect, test } from 'vitest';
import { listLayout } from './notecard.ts';

test('size 1 with a long item: one column, not two halves its words run across', () => {
  const items = ['buy a birthday present for grandma', 'b', 'c', 'd', 'e'];
  expect(listLayout(items, 1, 540).cols).toBe(1);
  // smaller lettering than 1 too: the half must still hold the widest item
  expect(listLayout(items, 0.6, 540).cols).toBe(1);
});

test('the shipped samples keep their two columns', () => {
  for (const s of ['濃咖啡|粗糖|可可酒|鮮奶油|香草莢|馬斯卡彭|手指餅乾|可可粉', 'unpack|clean the house|edit videos|workout|returns|grocery shop', '拆行李|打掃家裡|剪片|退貨|+ 運動|+ 買菜', '回信|繳帳單|買菜|運動|整理書桌|洗衣服'])
    expect(listLayout(s.split('|'), 1, 540).cols).toBe(2);
});
