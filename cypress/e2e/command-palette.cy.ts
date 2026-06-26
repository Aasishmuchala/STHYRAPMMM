/// <reference types="cypress" />

describe("Command palette + global search", () => {
  it("opens and jumps to a module", () => {
    cy.login(Cypress.env("OWNER_EMAIL"), Cypress.env("OWNER_PASSWORD"));
    cy.visit("/");

    // Wait for the client shell to hydrate, then use the real UI button path that dispatches
    // the command-palette open event. This avoids racing the effect that wires listeners in CI.
    cy.get('input[aria-label="Search"]').should("be.visible");
    cy.get("html").should("have.attr", "data-workspace-surface", "plane");
    cy.get("button.top-search-m").click({ force: true });
    cy.get('[role="dialog"][aria-label="Command palette"]', { timeout: 8000 }).should("be.visible");

    cy.get('input[placeholder*="Search or jump"]').type("Finances");
    cy.contains('[role="dialog"] button', "Finances").click();
    cy.location("pathname").should("eq", "/finances");
  });

  it("top-bar search returns live results", () => {
    const token = `ps${Date.now()}`;
    const clientName = `Palette Search Client ${token}`;

    cy.login(Cypress.env("OWNER_EMAIL"), Cypress.env("OWNER_PASSWORD"));
    cy.visit("/clients?new=1");
    cy.get('[role="dialog"]', { timeout: 15000 }).should("be.visible");
    cy.get("#f-name").clear().type(clientName);
    cy.get('[role="dialog"]').contains("button", "Create").click();
    cy.contains(".ccard", clientName, { timeout: 15000 }).should("be.visible");

    cy.visit("/");
    cy.get('input[aria-label="Search"]').type(token);
    cy.get('.gsearch-pop', { timeout: 10000 }).should("be.visible").within(() => {
      cy.contains(clientName).should("be.visible");
    });
  });
});
