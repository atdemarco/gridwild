const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const bucket = process.env.GRIDWILD_STORAGE_BUCKET || "gridwild-assets";
const publicAssetBase = process.env.GRIDWILD_ASSET_PUBLIC_BASE;

function joinPublicUrl(base, storagePath) {
  return [String(base || "").replace(/\/+$/g, ""), String(storagePath || "").replace(/^\/+/g, "")]
    .filter(Boolean)
    .join("/");
}

function publicUrl(storagePath) {
  if (!storagePath) return null;

  if (publicAssetBase) {
    return joinPublicUrl(publicAssetBase, storagePath);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return data?.publicUrl || null;
}

exports.handler = async function () {
  try {
    const { data: build, error } = await supabase
      .from("gw_asset_builds")
      .select(
        `
        build_id,
        schema_version,
        generated_at,
        asset_root,
        heat_file,
        observer_dictionary_file,
        square_summary_file,
        superchunk_dir,
        n_observations,
        n_squares,
        n_superchunks,
        n_observers
      `
      )
      .eq("is_current", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!build) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "No current GridWild asset build found." })
      };
    }

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=60"
      },
      body: JSON.stringify({
        bucket,
        publicAssetBase: publicAssetBase || null,
        build,
        urls: {
          manifest: publicUrl(`${build.asset_root}/manifest.json`),
          heat: publicUrl(build.heat_file),
          observerDictionary: publicUrl(build.observer_dictionary_file),
          squareSummary: publicUrl(build.square_summary_file),
          superchunkBase: publicUrl(build.superchunk_dir)
        }
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
