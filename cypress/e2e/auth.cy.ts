/// <reference types="cypress" />

describe("Authentication", () => {
  it("shows the Sthyra logo and sign-in form", () => {
    cy.visit("/login");
    cy.get('img[alt*="Sthyra"]').should("be.visible");
    cy.contains("h1", "Sign in").should("be.visible");
    cy.contains("Company email access only.").should("be.visible");
  });

  it("rejects invalid credentials and stays on /login", () => {
    cy.visit("/login");
    cy.get('input[type="email"]').type("nobody@example.com");
    cy.get('input[type="password"]').type("wrong-password", { log: false });
    cy.contains("button", "Sign in").click();
    cy.get('[role="alert"]', { timeout: 15000 }).should("be.visible");
    cy.location("pathname").should("eq", "/login");
  });

  it("logs the owner in and shows the full dashboard", () => {
    cy.login(Cypress.env("OWNER_EMAIL"), Cypress.env("OWNER_PASSWORD"));
    cy.contains("h1", "Good").should("be.visible"); // "Good morning/afternoon, Aasish"
    cy.get("aside.side").within(() => {
      cy.contains("Finances").should("exist");
      cy.contains("Assistant").should("exist");
    });
    cy.contains("Money in").should("exist"); // finance tiles
  });
});
