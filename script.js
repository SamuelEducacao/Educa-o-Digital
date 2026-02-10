// Scroll suave com compensação de acessibilidade para usuários com redução de movimento.
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const smoothLinks = document.querySelectorAll('a[href^="#"]');

smoothLinks.forEach((link) => {
  link.addEventListener('click', (event) => {
    const targetId = link.getAttribute('href');
    if (!targetId || targetId === '#') return;

    const target = document.querySelector(targetId);
    if (!target) return;

    event.preventDefault();
    target.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  });
});

// Revela elementos quando entram na área visível para criar uma animação discreta.
const observer = new IntersectionObserver(
  (entries, currentObserver) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      currentObserver.unobserve(entry.target);
    });
  },
  {
    threshold: 0.2,
    rootMargin: '0px 0px -5% 0px',
  }
);

document.querySelectorAll('.fade-in').forEach((element) => observer.observe(element));

// Pontos preparados para futura integração com links de formulários externos.
document.querySelectorAll('[data-future-link]').forEach((button) => {
  button.addEventListener('click', (event) => {
    if (button.getAttribute('href') !== '#') return;

    event.preventDefault();
    button.classList.add('pulse');
    setTimeout(() => button.classList.remove('pulse'), 250);
  });
});
