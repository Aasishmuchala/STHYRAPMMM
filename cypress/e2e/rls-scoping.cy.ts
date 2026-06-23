/// <reference types="cypress" />

// Role-based access — the most important thing to protect from regressions.
describe("Role scoping (RBAC)", () => {
  it("a division MEMBER sees only their division, no finances, no assistant", () => {
    cy.login(Cypress.env("MEMBER_EMAIL"), Cypress.env("MEMBER_PASSWORD"));

    cy.get('nav[aria-label="Modules"]').within(() => {
      cy.contains("Tasks").should("exist");
      cy.contains("Finances").should("not.exist"); // members can't see finances
      cy.contains("Assistant").should("not.exist"); // owner-only
    });
    cy.get('nav[aria-label="Divisions"]').within(() => {
      cy.contains("Studios").should("exist");
      cy.contains("Construction Management").should("not.exist"); // cross-division hidden
      cy.contains("Digital").should("not.exist");
    });
    cy.contains("Money in").should("not.exist"); // no finance tiles on dashboard
  });

  it("a division LEAD sees finances scoped to their division only, still no assistant", () => {
    cy.login(Cypress.env("LEAD_EMAIL"), Cypress.env("LEAD_PASSWORD"));

    cy.get('nav[aria-label="Modules"]').within(() => {
      cy.contains("Finances").should("exist"); // leads CAN see finances
      cy.contains("Assistant").should("not.exist"); // owner-only
    });
    cy.get('nav[aria-label="Divisions"]').within(() => {
      cy.contains("Construction Management").should("exist");
      cy.contains("Studios").should("not.exist"); // only their division
    });
    // dashboard finance summary is scoped to one division
    cy.contains("Money in").should("exist");
    cy.contains("4 divisions").should("not.exist");
  });
});
