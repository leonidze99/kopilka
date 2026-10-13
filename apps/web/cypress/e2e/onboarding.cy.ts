describe('Новый пользователь', () => {
  it('получает счёт и категории и сразу записывает расход', () => {
    cy.signUp();

    // Registration hands out a starting account and default categories,
    // so the first expense needs no setup.
    cy.contains('Основной счёт').should('be.visible');

    cy.get('select[name="categoryId"]').select('Продукты');
    cy.get('input[name="amount"]').type('1234,56');
    cy.get('input[name="comment"]').type('Пятёрочка');
    cy.contains('button', 'Добавить операцию').click();

    cy.contains('Операция добавлена').should('be.visible');

    // In the feed...
    cy.contains('Пятёрочка').should('be.visible');
    // ...and in the totals of the month.
    cy.contains('[class*="summary"], section', 'Итоги').should('exist');
    cy.contains('1 234,56').should('exist');
  });

  it('находит операцию поиском по комментарию', () => {
    cy.signUp();

    cy.get('select[name="categoryId"]').select('Кафе');
    cy.get('input[name="amount"]').type('420');
    cy.get('input[name="comment"]').type('Кофе на Пятёрочке');
    cy.contains('button', 'Добавить операцию').click();
    cy.contains('Кофе на Пятёрочке').should('be.visible');

    // Trigram search: a piece of a word, е for ё, any case.
    cy.get('input[type="search"]').type('пятерочк');
    cy.contains('mark', 'Пятёрочк').should('be.visible');

    cy.get('input[type="search"]').clear().type('такси');
    cy.contains('Ничего не найдено').should('be.visible');
  });
});
