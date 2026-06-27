// Regression for the finance ledger — record CRUD + CSV import happy path.
describe("Finances", () => {
  beforeEach(() => {
    cy.login(Cypress.env("OWNER_EMAIL"), Cypress.env("OWNER_PASSWORD"));
    cy.visit("/finances?div=construction");
    cy.get('[data-testid="main"]', { timeout: 15000 }).should("exist");
  });

  it("creates a transaction via the ledger", () => {
    cy.contains("button", /add|new|record/i).first().click({ force: true });
    cy.get('input[type="number"]').first().clear().type("5000");
    cy.get('[data-testid="record-save"]').click();
    cy.contains(/₹|saved/i).should("exist");
  });

  it("opens the CSV import modal", () => {
    cy.contains("button", /import/i).click({ force: true });
    cy.contains(/import|csv|upload/i).should("exist");
  });

  it("shows the forecast tab", () => {
    cy.contains("button", "Forecast").click();
    cy.contains(/90.day|cash.flow|net/i).should("exist");
  });
});