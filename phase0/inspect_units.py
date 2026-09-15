"""Read-only model units for the scale audit."""
import json
doc=__rhino_doc__
print(json.dumps(dict(path=doc.Path,units=str(doc.ModelUnitSystem),absolute_tolerance=doc.ModelAbsoluteTolerance)))
