import java.util.LinkedHashMap;
import java.util.HashSet;
import java.util.Set;
import java.util.zip.ZipFile;
import com.android.aapt.Resources.XmlNode;
import com.android.aapt.Resources.ResourceTable;
import com.google.protobuf.util.JsonFormat;
import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;

/** Read compiled XML using Google's schema from the official bundletool JAR. No extraction. */
class ReadBundleBackupRules {
  public static void main(String[] args) throws Exception {
    if (args.length != 1) throw new IllegalArgumentException("Expected an AAB path.");
    var resources = new LinkedHashMap<String, JsonElement>();
    try (var zip = new ZipFile(args[0])) {
      // Filename scans alone miss values-vNN aliases pointing at different XML.
      // Fail closed on aliases; every configured resource must resolve directly
      // to one of the explicit, inspected rule files for this release profile.
      var expected = Set.of("aptly_backup_rules", "aptly_data_extraction_rules");
      var found = new HashSet<String>();
      var tableEntry = zip.getEntry("base/resources.pb");
      if (tableEntry == null) throw new IllegalArgumentException("Missing base resource table.");
      try (var input = zip.getInputStream(tableEntry)) {
        for (var pkg : ResourceTable.parseFrom(input).getPackageList()) {
          for (var type : pkg.getTypeList()) {
            if (!type.getName().equals("xml")) continue;
            for (var entry : type.getEntryList()) {
              if (!expected.contains(entry.getName())) continue;
              found.add(entry.getName());
              if (entry.getConfigValueCount() == 0) throw new IllegalArgumentException("Empty backup resource.");
              for (var config : entry.getConfigValueList()) {
                var value = config.getValue();
                var item = value.getItem();
                if (!value.hasItem() || !item.hasFile() || !item.getFile().getPath().matches(
                    "res/xml(?:-[^/]+)?/" + entry.getName() + "\\.xml")) {
                  throw new IllegalArgumentException("Backup resource aliases/overrides require review: " + entry.getName());
                }
                if (zip.getEntry("base/" + item.getFile().getPath()) == null) {
                  throw new IllegalArgumentException("Missing referenced backup XML: " + entry.getName());
                }
              }
            }
          }
        }
      }
      if (!found.equals(expected)) throw new IllegalArgumentException("Missing backup resource table entries.");
      var entries = zip.entries();
      while (entries.hasMoreElements()) {
        var entry = entries.nextElement();
        if (!entry.getName().matches("base/res/xml(?:-[^/]+)?/aptly_(?:backup_rules|data_extraction_rules)\\.xml")) continue;
        if (resources.containsKey(entry.getName())) throw new IllegalArgumentException("Duplicate backup resource.");
        try (var input = zip.getInputStream(entry)) {
          var document = JsonFormat.printer().print(XmlNode.parseFrom(input));
          resources.put(entry.getName(), JsonParser.parseString(document));
        }
      }
    }
    System.out.println(new Gson().toJson(resources));
  }
}
