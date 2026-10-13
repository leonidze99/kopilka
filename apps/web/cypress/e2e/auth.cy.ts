describe('Вход и выход', () => {
  it('отправляет анонима на страницу входа', () => {
    cy.visit('/accounts');

    cy.location('pathname').should('eq', '/login');
    cy.contains('h1', 'Вход в Копилку').should('be.visible');
  });

  it('выходит и входит снова тем же паролем', () => {
    cy.signUp().then((email) => {
      cy.get('[aria-label="Выйти"]').click();
      cy.location('pathname').should('eq', '/login');

      cy.get('input[name="email"]').type(email);
      cy.get('input[name="password"]').type('correct horse battery');
      cy.contains('button', 'Войти').click();

      cy.contains('h1', 'Операции').should('be.visible');
    });
  });

  it('ведёт со страницы входа к восстановлению пароля', () => {
    cy.visit('/login');

    cy.contains('a', 'Забыли пароль?').click();

    cy.location('pathname').should('eq', '/forgot-password');
    cy.get('input[name="email"]').type('nobody@cypress.test');
    cy.contains('button', 'Отправить ссылку').click();

    // The same answer whether or not the address is registered.
    cy.contains('уже в пути').should('be.visible');
  });
});
