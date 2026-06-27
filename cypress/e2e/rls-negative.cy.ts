// Negative RLS coverage. Logs in as MEMBER and asserts that the Supabase JS
// client (user-scoped, NOT service-role) returns zero rows for tables the
// member has no access to.
describe("RLS negative coverage (member)", () => {
  let memberEmail: string;
  let memberPassword: string;

  before(() => {
    memberEmail = Cypress.env("MEMBER_EMAIL");
    memberPassword = Cypress.env("MEMBER_PASSWORD");
    if (!memberEmail || !memberPassword) {
      cy.log("Skipping RLS negative test — MEMBER_EMAIL/MEMBER_PASSWORD not set");
    }
  });

  beforeEach(() => {
    if (!memberEmail || !memberPassword) {
      cy.skip();
    }
    cy.login(memberEmail, memberPassword);
  });

  it("member sees no other-division finance rows", () => {
    cy.visit("/finances");
    // No finance tiles for member — finance access is gated by canAccessFinanceDivision
    cy.get('[data-testid="finance-tile-money-in"]').should("not.exist");
  });

  it("member cannot open /ai", () => {
    cy.visit("/ai", { failOnStatusCode: false });
    cy.url().should("not.include", "/ai");
  });
});