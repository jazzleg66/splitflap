function hasConfiguredValue(value) {
  return typeof value === 'string' && value && !value.includes('YOUR_');
}

function scrubPairCodeFromUrl(value) {
  if (typeof value !== 'string' || !value.includes('code=')) return value;
  try {
    const url = new URL(value, window.location.origin);
    url.searchParams.delete('code');
    return url.toString();
  } catch {
    return value.replace(/([?&])code=[^&#]*&?/gi, '$1').replace(/[?&]$/, '');
  }
}

function scrubEventUrls(value, depth = 0) {
  if (depth > 8 || value == null) return value;
  if (typeof value === 'string') return scrubPairCodeFromUrl(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      value[index] = scrubEventUrls(item, depth + 1);
    });
    return value;
  }
  if (typeof value === 'object') {
    for (const key of Object.keys(value)) {
      value[key] = scrubEventUrls(value[key], depth + 1);
    }
  }
  return value;
}

function loadScript(src, onLoad) {
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.crossOrigin = 'anonymous';
  if (onLoad) script.addEventListener('load', onLoad, { once: true });
  script.addEventListener(
    'error',
    () => console.warn(`[telemetry] Optional script failed to load: ${src}`),
    { once: true }
  );
  document.head.appendChild(script);
}

const sentryDsn = window.sentryDsn;
if (hasConfiguredValue(sentryDsn) && window.location.hostname !== 'localhost') {
  loadScript('https://browser.sentry-cdn.com/7.119.0/bundle.min.js', () => {
    if (!window.Sentry) return;
    window.Sentry.init({
      dsn: sentryDsn,
      environment: 'production',
      beforeSend(event) {
        return scrubEventUrls(event);
      },
    });
  });
}

const phKey = window.phKey;
if (hasConfiguredValue(phKey)) {
  try {
    !(function (t, e) {
      var _o, _n, p, r;
      e.__SV ||
        ((window.posthog = e),
        (e._i = []),
        (e.init = function (i, s, _a) {
          function _g(t, e) {
            var o = e.split('.');
            for (var n = 0; n < o.length; n++) t = t[o[n]];
            return t;
          }
          (p = t.createElement('script')),
            (p.type = 'text/javascript'),
            (p.async = !0),
            (p.crossOrigin = 'anonymous'),
            (p.src = 'https://cdn.posthog.com/array.js'),
            (r = t.getElementsByTagName('script')[0]).parentNode.insertBefore(p, r);
          var u = e;
          for (var c in s) u['__SV_' + c] = s[c];
          (u.__SV_loaded = !0),
            (e.config = s),
            (e.opt_in_capturing = function (t) {
              e.__opt_in_capturing = t;
            }),
            (e.opt_out_capturing = function (t) {
              e.__opt_out_capturing = t;
            }),
            e.opt_out_capturing(e.__opt_out_capturing === !0),
            (e.identify = function (t) {
              e.people && e.people.set && e.people.set(e.people.identify_flag || 'distinct_id', t);
            }),
            (e.reset = function () {
              delete window.posthog.distinctID;
            }),
            (e.register = function (t) {
              e.config = Object.assign({}, e.config, t);
            }),
            e.register({ config_name: e.config.name, loaded: new Date().toISOString(), version: e.config.version });
        }),
        (e.capture = function (t, o, n) {
          e._i.push([t, o, n]);
        }),
        (e.pageview = function (t, o) {
          e._i.push(['$pageview', { $current_url: scrubPairCodeFromUrl(t) }, o]);
        }),
        (e.people = e.people || {}),
        (e.people.set = function (t) {
          e._i.push(['people.set', t]);
        }));
    })(document, window.posthog || []);

    window.posthog.init(phKey, {
      api_host: 'https://app.posthog.com',
      person_profiles: 'identified_only',
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      sanitize_properties(properties) {
        return scrubEventUrls(properties);
      },
    });
  } catch (e) {
    console.warn('[telemetry] Optional PostHog init failed:', e.message);
  }
}
