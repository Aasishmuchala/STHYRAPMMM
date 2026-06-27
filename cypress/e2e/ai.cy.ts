// Regression for the AI assistant drawer + full-screen /ai page.
describe("AI assistant", () => {
  beforeEach(() => {
    cy.login(Cypress.env("OWNER_EMAIL"), Cypress.env("OWNER_PASSWORD"));
  });

  it("opens the AI drawer from the top bar", () => {
    cy.visit("/");
    cy.get('[data-testid="ai-trigger"]').click();
    cy.get('[data-testid="ai-drawer"]').should("exist");
    cy.contains(/Ask|Assistant|Opus/i).should("exist");
  });

  it("loads /ai as owner", () => {
    cy.visit("/ai");
    cy.contains(/Ask the assistant|Morning brief/i).should("exist");
  });
});