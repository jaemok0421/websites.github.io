(() => {
  const filterBar = document.querySelector("[data-tag-filters]");
  const grid = document.querySelector("[data-filter-grid]");

  if (!filterBar || !grid) return;

  const cards = [...grid.querySelectorAll(".card")];
  const tags = [...new Set(
    cards.flatMap((card) =>
      [...card.querySelectorAll(".tag")].map((tag) => tag.textContent.trim())
    )
  )];

  const options = ["全部", ...tags];
  const fragment = document.createDocumentFragment();

  options.forEach((tag, index) => {
    const button = document.createElement("button");
    button.className = "filter-button";
    button.type = "button";
    button.textContent = tag;
    button.dataset.tag = tag;
    button.setAttribute("aria-pressed", String(index === 0));
    fragment.appendChild(button);
  });

  filterBar.appendChild(fragment);

  filterBar.addEventListener("click", (event) => {
    const button = event.target.closest(".filter-button");
    if (!button) return;

    const selectedTag = button.dataset.tag;

    filterBar.querySelectorAll(".filter-button").forEach((item) => {
      item.setAttribute("aria-pressed", String(item === button));
    });

    cards.forEach((card) => {
      const cardTags = [...card.querySelectorAll(".tag")].map((tag) =>
        tag.textContent.trim()
      );
      const shouldHide =
        selectedTag !== "全部" && !cardTags.includes(selectedTag);
      card.classList.toggle("is-filtered-out", shouldHide);
      card.hidden = shouldHide;
    });
  });
})();
