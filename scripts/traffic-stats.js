/**
 * Carga traffic/stats.json como máximo una vez por día (localStorage + caché HTTP).
 */
(function () {
    'use strict';

    var URL = 'traffic/stats.json';
    var LS_KEY = 'tudex_metrics_v1';

    var lastPayload = null;

    function localDay() {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function loadPayload(force) {
        if (!force) {
            var day = localDay();
            try {
                var row = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
                if (row.day === day && row.payload && row.payload.summary && !row.payload.error) {
                    lastPayload = row.payload;
                    return Promise.resolve(row.payload);
                }
            } catch (e) {
                console.warn('TudexTraffic: Failed to read from localStorage', e);
            }
        }

        return fetch(URL, { cache: force ? 'no-cache' : 'default' })
            .then(function (r) { return r.ok ? r.json() : { error: true }; })
            .catch(function() { return { error: true }; })
            .then(function (payload) {
                if (payload && payload.summary && !payload.error) {
                    lastPayload = payload;
                    try {
                        var day = localDay();
                        localStorage.setItem(LS_KEY, JSON.stringify({ day: day, payload: payload }));
                    } catch (e) {
                        console.warn('TudexTraffic: Failed to write to localStorage', e);
                    }
                }
                return payload;
            });
    }

    function applyHome(payload) {
        if (!payload || !payload.summary || payload.error) return;
        var sum = payload.summary;

        var labels = [document.getElementById('hero-traffic-label'), document.getElementById('media-requests-label')];
        var w = sum.windowDays || sum.daysWithData || '—';
        var periodText = 'Solicitudes · últimos ' + w + ' días';
        labels.forEach(function(l) {
            if (l) l.textContent = periodText;
        });

        if (window.TudexStats) {
            window.TudexStats.setHeroTraffic(sum.totalRequests);

            // Update other counters if they exist
            var elSites = document.getElementById('stat-hero-sites');
            if (elSites && sum.sitesCount) {
                elSites.dataset.target = String(sum.sitesCount);
                new (window.CounterAnimator || Object)(elSites).animate?.();
            }

            var elMediaReq = document.getElementById('stat-media-requests');
            if (elMediaReq && sum.totalRequests) {
                elMediaReq.dataset.target = String(sum.totalRequests);
                new (window.CounterAnimator || Object)(elMediaReq).animate?.();
            }
        }
    }

    window.TudexTraffic = {
        load: loadPayload,
        getPayload: function () { return lastPayload; },
        refresh: function() {
            return loadPayload(true).then(function(payload) {
                if (document.body && document.body.getAttribute('data-page') === 'home') {
                    applyHome(payload);
                }
                window.dispatchEvent(new CustomEvent('tudextraffic', { detail: payload }));
                return payload;
            });
        }
    };

    function init() {
        loadPayload().then(function (payload) {
            if (document.body && document.body.getAttribute('data-page') === 'home') {
                applyHome(payload);
            }
            try {
                window.dispatchEvent(new CustomEvent('tudextraffic', { detail: payload }));
            } catch (e) {
                console.error('TudexTraffic: Failed to dispatch event', e);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
