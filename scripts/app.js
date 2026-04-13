/**
 * Tudex Networks - Main JavaScript
 * Version: 1.0.0
 * 
 * Simple, clean, and performant.
 */

(function () {
    'use strict';

    /**
     * Counter Animation
     * Animates numeric values with easing
     */
    class CounterAnimator {
        constructor(element, options = {}) {
            this.element = element;
            this.target = this.parseTarget(element.dataset.target);
            this.duration = options.duration || 2000;
            this.started = false;
        }

        parseTarget(value) {
            if (!value) return 0;
            return parseInt(value.toString().replace(/[^0-9]/g, ''), 10) || 0;
        }

        formatNumber(num) {
            if (num >= 1000000) {
                return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
            }
            if (num >= 1000) {
                return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
            }
            return num.toString();
        }

        easeOutQuart(t) {
            return 1 - Math.pow(1 - t, 4);
        }

        animate() {
            if (this.started || !this.target) return;
            this.started = true;

            const startTime = performance.now();
            const target = this.target;
            const element = this.element;
            const duration = this.duration;
            const formatNumber = this.formatNumber;
            const easeOutQuart = this.easeOutQuart;

            const step = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const easedProgress = easeOutQuart(progress);
                const current = Math.floor(easedProgress * target);

                element.textContent = formatNumber(current);

                if (progress < 1) {
                    requestAnimationFrame(step);
                } else {
                    element.textContent = formatNumber(target);
                }
            };

            requestAnimationFrame(step);
        }
    }

    /**
     * Initialize Intersection Observer for counters
     */
    function initCounters() {
        const counters = document.querySelectorAll('.stat-value[data-target]');
        if (!counters.length) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const animator = new CounterAnimator(entry.target);
                    animator.animate();
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.2,
            rootMargin: '0px 0px -50px 0px'
        });

        counters.forEach(counter => observer.observe(counter));
    }

    /**
     * Actualiza el contador del hero con datos externos (p. ej. métricas agregadas).
     */
    window.TudexStats = {
        setHeroTraffic(value) {
            const el = document.getElementById('hero-traffic-value');
            if (!el || value == null) return;
            const n = Math.floor(Number(value));
            el.dataset.target = String(n);
            el.textContent = '0';
            if (n <= 0) return;
            const animator = new CounterAnimator(el);
            animator.animate();
        }
    };

    /**
     * Smooth scroll for anchor links
     */
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                const href = this.getAttribute('href');
                if (href === '#') return;

                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    const headerOffset = 80;
                    const elementPosition = target.getBoundingClientRect().top;
                    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                    window.scrollTo({
                        top: offsetPosition,
                        behavior: 'smooth'
                    });
                }
            });
        });
    }

    /**
     * Header scroll effect
     */
    function initHeaderScroll() {
        const header = document.getElementById('header');
        if (!header) return;

        let lastScroll = 0;
        let ticking = false;

        const updateHeader = () => {
            const currentScroll = window.pageYOffset;

            if (currentScroll > 50) {
                header.style.background = 'rgba(0, 0, 0, 0.9)';
                header.style.backdropFilter = 'blur(10px)';
                header.style.borderBottom = '1px solid rgba(255, 255, 255, 0.08)';
            } else {
                header.style.background = 'transparent';
                header.style.backdropFilter = 'none';
                header.style.borderBottom = 'none';
            }

            lastScroll = currentScroll;
            ticking = false;
        };

        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(updateHeader);
                ticking = true;
            }
        }, { passive: true });
    }

    /**
     * Initialize on DOM ready
     */
    function init() {
        initCounters();
        initSmoothScroll();
        initHeaderScroll();
    }

    window.CounterAnimator = CounterAnimator;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
