const petId = new URLSearchParams(window.location.search).get('pet') || 'qwen';

if (petId !== 'qwen') {
  window.__TAURI__.core
    .invoke('resolve_pet_sprite', { petId })
    .then((file) => {
      if (!file) return;
      document.querySelector('.pet').style.backgroundImage =
        `url("${window.__TAURI__.core.convertFileSrc(file)}")`;
      document
        .querySelector('.pet')
        .setAttribute('aria-label', `${petId} desktop pet`);
    })
    .catch(console.error);
}
