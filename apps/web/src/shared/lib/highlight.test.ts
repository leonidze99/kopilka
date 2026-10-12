import { highlight } from './highlight';

describe('highlight', () => {
  it('marks every match, whatever the case', () => {
    expect(highlight('Такси до такси', 'такси')).toEqual([
      { text: 'Такси', match: true },
      { text: ' до ', match: false },
      { text: 'такси', match: true },
    ]);
  });

  it('matches ё and е both ways, keeping the original letters', () => {
    expect(highlight('Пятёрочка', 'пятерочка')).toEqual([
      { text: 'Пятёрочка', match: true },
    ]);
    expect(highlight('Перекресток у дома', 'КРЁС')).toEqual([
      { text: 'Пере', match: false },
      { text: 'крес', match: true },
      { text: 'ток у дома', match: false },
    ]);
  });

  it('leaves the text whole without a match or a query', () => {
    expect(highlight('Метро', 'такси')).toEqual([
      { text: 'Метро', match: false },
    ]);
    expect(highlight('Метро', '  ')).toEqual([{ text: 'Метро', match: false }]);
  });
});
