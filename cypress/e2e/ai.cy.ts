// Regression for the AI assistant drawer + full-screen /ai page.
describe("AI assistant", () => {
  beforeEach(() => {
    cy.login(Cypress.env("OWNER_EMAIL"), Cypress.env("OWNER_PASSWORD"));
  });

  it("opens the AI drawer from the top bar", () => {
    cy.visit("/");
    // Wait for the client shell to hydrate before dispatching the open event —
    // AppShell sets data-workspace-surface in an effect, and React runs the
    // child AiDrawerHost listener effect before it, so once this attribute is
    // present the "sthyra:open-ai" listener is guaranteed wired. Mirrors
    // command-palette.cy.ts; avoids racing the one-shot event in CI.
    cy.get("html").should("have.attr", "data-workspace-surface", "plane");
    cy.get('[data-testid="ai-trigger"]').click();
    cy.get('[data-testid="ai-drawer"]').should("exist");
    cy.contains(/Ask|Assistant|Opus/i).should("exist");
  });

  it("loads /ai as owner", () => {
    cy.visit("/ai");
    cy.contains(/Ask the assistant|Morning brief/i).should("exist");
  });
});