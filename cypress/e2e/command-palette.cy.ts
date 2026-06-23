/// <reference types="cypress" />

describe("Command palette + global search", () => {
  it("opens with Cmd/Ctrl+K and jumps to a module", () => {
    cy.login(Cypress.env("OWNER_EMAIL"), Cypress.env("OWNER_PASSWORD"));

    // Ensure the app shell has hydrated (so the palette's window keydown listener is attached),
    // then fire a bubbling keydown that reaches it — exercises the real ⌘K/Ctrl+K handler.
    cy.get('input[aria-label="Search"]').should("be.visible");
    cy.get("body").trigger("keydown", { key: "k", metaKey: true, bubbles: true });
    cy.contains("Go to", { timeout: 8000 }).should("be.visible");

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
