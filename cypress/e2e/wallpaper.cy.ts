/// <reference types="cypress" />

// Regression for the bug where a custom image URL wallpaper rendered at native size
// instead of covering the viewport (background-size layer mis-mapping).
describe("Custom wallpaper", () => {
  it("applies a custom image URL as a full-cover background", () => {
    cy.login(Cypress.env("OWNER_EMAIL"), Cypress.env("OWNER_PASSWORD"));
    cy.visit("/settings");

    cy.get("#wp-url").clear().type("https://picsum.photos/1200/800");
    cy.get("#wp-url").closest(".field-row").contains("button", "Apply").click();

    cy.window().then((win) => {
      const v = win.document.documentElement.style.getPropertyValue("--wallpaper-image");
      expect(v, "wallpaper variable").to.contain("picsum.photos");
      const pseudo = win.getComputedStyle(win.document.body, "::before");
      expect(pseudo.backgroundImage, "pseudo background image").to.contain("picsum.photos");
      expect(pseudo.backgroundSize, "background-size includes cover").to.contain("cover");
    });

    cy.contains("button", "None").click(); // reset so the account stays clean
  });
});
