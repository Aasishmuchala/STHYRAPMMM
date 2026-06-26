/// <reference types="cypress" />

describe("Clients pipeline (CRUD)", () => {
  const NAME = "Cypress QA Client";

  it("owner can add a client, see it in the pipeline, then delete it", () => {
    cy.login(Cypress.env("OWNER_EMAIL"), Cypress.env("OWNER_PASSWORD"));
    cy.visit("/clients?new=1");

    cy.get('[role="dialog"]', { timeout: 15000 }).should("be.visible");
    cy.get("#f-name").type(NAME);
    cy.get('[role="dialog"]').contains("button", "Create").click();

    cy.contains(".ccard", NAME, { timeout: 15000 }).should("be.visible");

    // cleanup so the suite is idempotent
    cy.contains(".ccard", NAME).find('button[aria-label="Delete"]').click();
    cy.get('[role="alertdialog"]').contains("button", "Delete").click();
    cy.contains(".ccard", NAME).should("not.exist");
  });
});
