declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Registers a fresh account through the form and waits for the start
       * page. Yields the email, so a spec can sign in with it again.
       */
      signUp(): Chainable<string>;
    }
  }
}

const PASSWORD = 'correct horse battery';

Cypress.Commands.add('signUp', () => {
  // A new address per run: the specs share one database with whoever else
  // is using it, and registration must not hit an existing account.
  const email = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cypress.test`;

  cy.visit('/register');
  cy.get('input[name="email"]').type(email);
  cy.get('input[name="password"]').type(PASSWORD);
  cy.contains('button', 'Зарегистрироваться').click();

  cy.contains('h1', 'Операции').should('be.visible');
  return cy.wrap(email, { log: false });
});

export { PASSWORD };
