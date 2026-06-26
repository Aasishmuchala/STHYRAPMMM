/// <reference types="cypress" />

describe("Command palette + global search", () => {
  it("opens and jumps to a module", () => {
    cy.login(Cypress.env("OWNER_EMAIL"), Cypress.env("OWNER_PASSWORD"));

    // Open via the app's custom event to avoid flaky synthetic modifier-key handling in CI.
    cy.get('input[aria-label="Search"]').should("be.visible");
    cy.window().then((win) => {
      win.dispatchEvent(new Event("sthyra:open-cmdk"));
    });
    cy.get('[role="dialog"][aria-label="Command palette"]', { timeout: 8000 }).should("be.visible");

    cy.get('input[placeholder*="Search or jump"]').type("Finances");
    cy.contains('[role="dialog"] button', "Finances").click();
    cy.location("pathname").should("eq", "/finances");
  });

  it("top-bar search returns live results", () => {
    cy.login(Cypress.env("OWNER_EMAIL"), Cypress.env("OWNER_PASSWORD"));
    cy.get('input[aria-label="Search"]').type("veranza");
    cy.contains("Veranza", { timeout: 10000 }).should("be.visible");
  });
});
