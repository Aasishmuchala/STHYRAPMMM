/// <reference types="cypress" />

describe("Command palette + global search", () => {
  it("opens and jumps to a module", () => {
    cy.login(Cypress.env("OWNER_EMAIL"), Cypress.env("OWNER_PASSWORD"));

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
    const clientName = `Palette Search Client ${Date.now()}`;

    cy.login(Cypress.env("OWNER_EMAIL"), Cypress.env("OWNER_PASSWORD"));
    cy.visit("/clients");
    cy.contains("button", "Add client").first().click();
    cy.get("#f-name").clear().type(clientName);
    cy.get('[role="dialog"]').contains("button", "Create").click();
    cy.contains(".ccard", clientName, { timeout: 15000 }).should("be.visible");

    cy.visit("/");
    cy.get('input[aria-label="Search"]').type("palette");
    cy.contains(clientName, { timeout: 10000 }).should("be.visible");

    cy.visit("/clients");
    cy.contains(".ccard", clientName).find('button[aria-label="Delete"]').click();
    cy.get('[role="alertdialog"]').contains("button", "Delete").click();
    cy.contains(".ccard", clientName).should("not.exist");
  });
});
